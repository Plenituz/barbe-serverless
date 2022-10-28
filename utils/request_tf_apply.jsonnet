local barbe = std.extVar("barbe");


barbe.databags([
    {
        Type: "terraform_execute",
        Name: "default",
        Value: {
            require_confirmation: !std.objectHas(container, "cr_[terraform]"),
            message:
                if !std.objectHas(container, "cr_[terraform]") then
                    "WARNING: using `barbe apply` without an external backend for terraform (such as state_store) WILL lead to your terraform state being lost if the terraform template fails to apply. Run terraform apply anyway? [yes/no]\n"
                else
                    "Applying Terraform plan, stopping the process now can lead to orphan resources"
                ,
            command: "apply",
            dir: std.extVar("barbe_output_dir"),
            no_cache: true,
        }
    }
])